"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { TopNav } from "@/components/layout/top-nav";
import { MobileNav } from "@/components/layout/mobile-nav";
import { JobCard } from "@/components/job/job-card";
import { Button } from "@/components/ui/button";
import { GhostScore } from "@/components/ui/ghost-score";
import { SalaryRange } from "@/components/ui/salary-range";
import { CompanyTrajBadge } from "@/components/ui/company-badge";
import { LiveCounter } from "@/components/ui/live-counter";
import { IntelligenceCard } from "@/components/ui/intelligence-card";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CompanyInfo {
  company: string;
  total_jobs: number;
  markets: string[];
  categories: string[];
  avg_salary_min: number | null;
  avg_salary_max: number | null;
  remote_pct: number | null;
  earliest_post: string | null;
  latest_post: string | null;
}

interface Job {
  job_id: string;
  title: string;
  company: string;
  company_logo?: string;
  location?: string;
  country?: string;
  is_remote?: boolean;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_period?: string;
  ghost_score?: number | null;
  posted_at?: string;
  required_skills?: string;
  source?: string;
  apply_link?: string;
  description?: string;
  employment_type?: string;
  experience_required?: string;
  category?: string;
  search_category?: string;
}

interface TimelineEntry {
  date: string;
  postings: number;
}

interface CompanyIntelReport {
  company: string;
  total_postings: number;
  markets: string[];
  categories: string[];
  salary_intel: Record<string, unknown>;
  remote_percentage: number;
  weekly_trend: { week: string; count: number }[];
  top_skills: Record<string, number>;
  department_breakdown: Record<string, number>;
  ghost_analysis: {
    avg_ghost_score?: number;
    ghost_rate?: number;
    total_analyzed?: number;
    likely_ghost?: number;
  };
  risk_scores: Record<string, unknown>;
  trajectory: string;
  ai_narrative: string | null;
  error?: string | null;
}

interface LayoffRisk {
  company: string;
  risk_score: number;
  risk_level: string;
  signals: { signal: string; severity: string; description: string }[];
  weekly_trend: { week: string; count: number }[];
  total_historical_postings: number;
  recent_14d_postings: number;
  ai_assessment: string | null;
}

interface IpoSignal {
  company: string;
  ipo_probability: number;
  confidence: string;
  signals: { signal: string; strength: string; description: string }[];
  ipo_related_roles: { title: string; category: string }[];
  hiring_velocity: Record<string, unknown>;
  category_diversity: number;
  ai_assessment: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type TabId = "overview" | "roles" | "salary" | "signals" | "culture";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "roles", label: "Open Roles" },
  { id: "salary", label: "Salary Intel" },
  { id: "signals", label: "Signals" },
  { id: "culture", label: "Culture" },
];

const JOBS_PER_PAGE = 20;

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

function formatSalary(amount: number): string {
  if (amount >= 1_000_000) {
    const val = amount / 1_000_000;
    return `$${val % 1 === 0 ? val.toFixed(0) : val.toFixed(1)}M`;
  }
  if (amount >= 1000) {
    return `$${Math.round(amount / 1000)}K`;
  }
  return `$${amount}`;
}

function formatDate(timestamp: string): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function normalizeTrajectory(
  t: string | undefined
): "scaling" | "stable" | "contracting" | "risk" {
  if (!t) return "stable";
  const lower = t.toLowerCase();
  if (lower === "scaling" || lower === "growing") return "scaling";
  if (lower === "contracting" || lower === "declining") return "contracting";
  if (lower === "risk" || lower === "at_risk" || lower === "at risk") return "risk";
  return "stable";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CompanyDetailPage() {
  const params = useParams<{ name: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const companyName = decodeURIComponent(params.name || "");

  // --------------- Data state ---------------
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [totalJobs, setTotalJobs] = useState(0);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [intelReport, setIntelReport] = useState<CompanyIntelReport | null>(null);
  const [layoffRisk, setLayoffRisk] = useState<LayoffRisk | null>(null);
  const [ipoSignal, setIpoSignal] = useState<IpoSignal | null>(null);

  // --------------- UI state ---------------
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [jobsPage, setJobsPage] = useState(1);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [remoteOnly, setRemoteOnly] = useState(false);

  // --------------- Auth guard ---------------
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  // --------------- Fetch core company data ---------------
  const fetchCompany = useCallback(async () => {
    if (!companyName) return;
    setLoading(true);
    setNotFound(false);

    try {
      const [info, jobsData, timelineData] = await Promise.all([
        api.get<CompanyInfo>(`/companies/${encodeURIComponent(companyName)}`),
        api.get<Job[]>(
          `/companies/${encodeURIComponent(companyName)}/jobs?page=1&per_page=${JOBS_PER_PAGE}`
        ),
        api.get<TimelineEntry[]>(
          `/companies/${encodeURIComponent(companyName)}/timeline`
        ),
      ]);

      setCompanyInfo(info);
      setJobs(jobsData);
      setTotalJobs(info.total_jobs);
      setTimeline(timelineData);
    } catch {
      setNotFound(true);
      setCompanyInfo(null);
    } finally {
      setLoading(false);
    }
  }, [companyName]);

  // --------------- Fetch intelligence data (lazy) ---------------
  const fetchIntelligence = useCallback(async () => {
    if (!companyName) return;

    const results = await Promise.allSettled([
      api.get<CompanyIntelReport>(
        `/intelligence/company/${encodeURIComponent(companyName)}`
      ),
      api.get<LayoffRisk>(
        `/intelligence/radar/layoff/${encodeURIComponent(companyName)}`
      ),
      api.get<IpoSignal>(
        `/intelligence/radar/ipo/${encodeURIComponent(companyName)}`
      ),
    ]);

    if (results[0].status === "fulfilled") setIntelReport(results[0].value);
    if (results[1].status === "fulfilled") setLayoffRisk(results[1].value);
    if (results[2].status === "fulfilled") setIpoSignal(results[2].value);
  }, [companyName]);

  useEffect(() => {
    fetchCompany();
  }, [fetchCompany]);

  useEffect(() => {
    if (companyInfo) {
      fetchIntelligence();
    }
  }, [companyInfo, fetchIntelligence]);

  // --------------- Load more jobs ---------------
  const loadMoreJobs = useCallback(async () => {
    if (!companyName || jobsLoading) return;
    setJobsLoading(true);
    const nextPage = jobsPage + 1;

    try {
      const moreJobs = await api.get<Job[]>(
        `/companies/${encodeURIComponent(companyName)}/jobs?page=${nextPage}&per_page=${JOBS_PER_PAGE}`
      );
      setJobs((prev) => [...prev, ...moreJobs]);
      setJobsPage(nextPage);
    } catch {
      // Non-critical
    } finally {
      setJobsLoading(false);
    }
  }, [companyName, jobsPage, jobsLoading]);

  // --------------- Derived data ---------------
  const letterColor = useMemo(
    () => (companyName ? getLettermarkColor(companyName) : "var(--cyan)"),
    [companyName]
  );

  const trajectory = useMemo(
    () => normalizeTrajectory(intelReport?.trajectory),
    [intelReport]
  );

  const categories = useMemo(() => {
    const cats = new Set<string>();
    jobs.forEach((j) => {
      if (j.search_category) cats.add(j.search_category);
      if (j.category) cats.add(j.category);
    });
    if (companyInfo?.categories) {
      companyInfo.categories.forEach((c) => cats.add(c));
    }
    return Array.from(cats).filter(Boolean).sort();
  }, [jobs, companyInfo]);

  const filteredJobs = useMemo(() => {
    let result = jobs;
    if (categoryFilter !== "all") {
      result = result.filter(
        (j) => j.search_category === categoryFilter || j.category === categoryFilter
      );
    }
    if (remoteOnly) {
      result = result.filter((j) => j.is_remote);
    }
    return result;
  }, [jobs, categoryFilter, remoteOnly]);

  const timelineLast30 = useMemo(() => {
    const sorted = [...timeline].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    return sorted.slice(-30);
  }, [timeline]);

  const maxPostings = useMemo(
    () => Math.max(1, ...timelineLast30.map((d) => d.postings)),
    [timelineLast30]
  );

  // Salary by category
  const salaryByCategory = useMemo(() => {
    const catMap: Record<string, { total: number; count: number }> = {};
    jobs.forEach((j) => {
      const cat = j.search_category || j.category || "Other";
      const mid =
        j.salary_min && j.salary_max
          ? (j.salary_min + j.salary_max) / 2
          : j.salary_min || j.salary_max || 0;
      if (mid > 0) {
        if (!catMap[cat]) catMap[cat] = { total: 0, count: 0 };
        catMap[cat].total += mid;
        catMap[cat].count += 1;
      }
    });
    return Object.entries(catMap)
      .map(([cat, data]) => ({
        category: cat,
        avg: Math.round(data.total / data.count),
      }))
      .sort((a, b) => b.avg - a.avg);
  }, [jobs]);

  const maxSalary = useMemo(
    () => Math.max(1, ...salaryByCategory.map((s) => s.avg)),
    [salaryByCategory]
  );

  // --------------- Auth loading ---------------
  if (authLoading || !user) return null;

  // --------------- Loading skeleton ---------------
  if (loading) {
    return (
      <div
        className="flex flex-col min-h-screen"
        style={{ backgroundColor: "var(--bg-deep)" }}
      >
        <TopNav />
        <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
          {/* Header skeleton */}
          <div className="card p-8 mb-6">
            <div className="flex items-center gap-6">
              <div
                className="w-20 h-20 rounded-2xl shimmer"
                style={{ backgroundColor: "var(--bg-elevated)" }}
              />
              <div className="flex-1 space-y-3">
                <div
                  className="shimmer rounded"
                  style={{ height: "28px", width: "260px" }}
                />
                <div
                  className="shimmer rounded"
                  style={{ height: "16px", width: "180px" }}
                />
                <div className="flex gap-2">
                  <div
                    className="shimmer rounded-full"
                    style={{ height: "24px", width: "80px" }}
                  />
                  <div
                    className="shimmer rounded-full"
                    style={{ height: "24px", width: "60px" }}
                  />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="shimmer rounded-lg"
                  style={{ height: "64px" }}
                />
              ))}
            </div>
          </div>
          {/* Tab skeleton */}
          <div className="flex gap-4 mb-6">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="shimmer rounded"
                style={{ height: "36px", width: "100px" }}
              />
            ))}
          </div>
          {/* Content skeleton */}
          <div className="space-y-4">
            <div className="card shimmer rounded-lg" style={{ height: "200px" }} />
            <div className="card shimmer rounded-lg" style={{ height: "160px" }} />
            <div className="card shimmer rounded-lg" style={{ height: "120px" }} />
          </div>
        </main>
        <MobileNav />
      </div>
    );
  }

  // --------------- 404 state ---------------
  if (notFound || !companyInfo) {
    return (
      <div
        className="flex flex-col min-h-screen"
        style={{ backgroundColor: "var(--bg-deep)" }}
      >
        <TopNav />
        <main className="flex-1 flex flex-col items-center justify-center px-4 text-center">
          <svg
            className="w-20 h-20 mb-6"
            viewBox="0 0 80 80"
            fill="none"
            aria-hidden="true"
            style={{ color: "var(--text-muted)" }}
          >
            <rect
              x="15"
              y="20"
              width="50"
              height="40"
              rx="4"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path
              d="M15 32h50"
              stroke="currentColor"
              strokeWidth="2"
            />
            <circle cx="24" cy="26" r="2" fill="currentColor" />
            <circle cx="32" cy="26" r="2" fill="currentColor" />
            <circle cx="40" cy="26" r="2" fill="currentColor" />
            <path
              d="M30 48l5-5 5 5M50 48l-5-5-5 5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <h1
            className="text-2xl font-display mb-3"
            style={{ color: "var(--text-primary)" }}
          >
            Company Not Found
          </h1>
          <p
            className="text-sm mb-8 max-w-md"
            style={{ color: "var(--text-secondary)" }}
          >
            We could not find data for &ldquo;{companyName}&rdquo;. The company
            may not have any tracked job postings yet, or the name may be incorrect.
          </p>
          <Button
            variant="primary"
            onClick={() => router.push("/seeker/companies")}
          >
            Browse Companies
          </Button>
        </main>
        <MobileNav />
      </div>
    );
  }

  // --------------- Main render ---------------
  return (
    <div
      className="flex flex-col min-h-screen"
      style={{ backgroundColor: "var(--bg-deep)" }}
    >
      <TopNav />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-6">
        {/* Breadcrumb */}
        <nav
          className="flex items-center gap-2 text-xs mb-6"
          aria-label="Breadcrumb"
        >
          <Link
            href="/seeker/companies"
            className="transition-colors duration-150 hover:underline"
            style={{ color: "var(--text-muted)" }}
          >
            Companies
          </Link>
          <span style={{ color: "var(--text-muted)" }} aria-hidden="true">
            /
          </span>
          <span style={{ color: "var(--text-secondary)" }}>
            {companyInfo.company}
          </span>
        </nav>

        {/* ================================================================
            COMPANY HEADER (Hero)
            ================================================================ */}
        <section className="card p-6 sm:p-8 mb-6">
          <div className="flex flex-col sm:flex-row items-start gap-5">
            {/* Lettermark */}
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center font-display text-3xl shrink-0"
              style={{
                backgroundColor: `color-mix(in srgb, ${letterColor} 15%, transparent)`,
                color: letterColor,
                border: `1px solid color-mix(in srgb, ${letterColor} 25%, transparent)`,
              }}
            >
              {companyInfo.company.charAt(0).toUpperCase()}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1
                  className="text-2xl sm:text-3xl font-display leading-tight"
                  style={{ color: "var(--text-primary)" }}
                >
                  {companyInfo.company}
                </h1>
                {intelReport && (
                  <CompanyTrajBadge trajectory={trajectory} size="md" />
                )}
              </div>

              {/* Markets pills */}
              {companyInfo.markets.length > 0 && (
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  {companyInfo.markets.map((market) => (
                    <span
                      key={market}
                      className="px-2.5 py-1 rounded-full text-xs font-medium"
                      style={{
                        backgroundColor: "var(--cyan-08)",
                        color: "var(--cyan)",
                        border: "1px solid var(--border-subtle)",
                      }}
                    >
                      {market}
                    </span>
                  ))}
                </div>
              )}

              {/* Categories pills */}
              {companyInfo.categories.length > 0 && (
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  {companyInfo.categories.map((cat) => (
                    <span
                      key={cat}
                      className="px-2 py-0.5 rounded text-[11px] font-medium"
                      style={{
                        backgroundColor: "var(--bg-elevated)",
                        color: "var(--text-secondary)",
                        border: "1px solid var(--border-subtle)",
                      }}
                    >
                      {cat}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Stats row */}
          <div
            className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6"
            style={{ borderTop: "1px solid var(--border-subtle)" }}
          >
            <StatBlock
              label="Total Jobs"
              value={companyInfo.total_jobs.toLocaleString()}
            />
            <StatBlock
              label="Remote %"
              value={
                companyInfo.remote_pct != null
                  ? `${Math.round(companyInfo.remote_pct)}%`
                  : "--"
              }
            />
            <StatBlock
              label="Avg Salary"
              value={
                companyInfo.avg_salary_min || companyInfo.avg_salary_max
                  ? `${
                      companyInfo.avg_salary_min
                        ? formatSalary(companyInfo.avg_salary_min)
                        : "?"
                    } - ${
                      companyInfo.avg_salary_max
                        ? formatSalary(companyInfo.avg_salary_max)
                        : "?"
                    }`
                  : "Not disclosed"
              }
            />
            <StatBlock
              label="Hiring Since"
              value={
                companyInfo.earliest_post
                  ? formatDate(companyInfo.earliest_post)
                  : "--"
              }
            />
          </div>
        </section>

        {/* ================================================================
            TAB NAVIGATION
            ================================================================ */}
        <div
          className="flex items-center gap-1 overflow-x-auto mb-6 pb-px scrollbar-none"
          role="tablist"
          aria-label="Company sections"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className="relative px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors duration-200 shrink-0"
              style={{
                color:
                  activeTab === tab.id
                    ? "var(--cyan)"
                    : "var(--text-secondary)",
              }}
            >
              {tab.label}
              {activeTab === tab.id && (
                <span
                  className="absolute bottom-0 left-0 right-0 h-[2px]"
                  style={{ backgroundColor: "var(--cyan)" }}
                />
              )}
            </button>
          ))}
        </div>

        {/* ================================================================
            TAB CONTENT
            ================================================================ */}

        {/* --- Overview Tab --- */}
        {activeTab === "overview" && (
          <div id="panel-overview" role="tabpanel" className="space-y-6">
            {/* AI Summary */}
            {intelReport?.ai_narrative && (
              <article
                className="card p-6"
                style={{ borderLeft: "3px solid var(--cyan)" }}
              >
                <h2
                  className="text-xs font-semibold uppercase tracking-wider mb-3"
                  style={{ color: "var(--text-muted)" }}
                >
                  AI Company Summary
                </h2>
                <p
                  className="text-sm leading-relaxed whitespace-pre-line"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {intelReport.ai_narrative}
                </p>
              </article>
            )}

            {/* Hiring Velocity */}
            <section className="card p-6">
              <h2
                className="text-xs font-semibold uppercase tracking-wider mb-4"
                style={{ color: "var(--text-muted)" }}
              >
                Hiring Velocity
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
                <LiveCounter
                  value={companyInfo.total_jobs}
                  label="Active postings"
                  trend={
                    intelReport
                      ? trajectory === "scaling"
                        ? "up"
                        : trajectory === "contracting" || trajectory === "risk"
                          ? "down"
                          : "neutral"
                      : undefined
                  }
                  trendValue={
                    intelReport?.trajectory
                      ? intelReport.trajectory
                      : undefined
                  }
                />
                <LiveCounter
                  value={
                    timelineLast30.reduce((sum, d) => sum + d.postings, 0)
                  }
                  label="Last 30 days"
                />
                <LiveCounter
                  value={companyInfo.categories.length}
                  label="Categories"
                />
              </div>
            </section>

            {/* Hiring Timeline */}
            {timelineLast30.length > 0 && (
              <section className="card p-6">
                <h2
                  className="text-xs font-semibold uppercase tracking-wider mb-4"
                  style={{ color: "var(--text-muted)" }}
                >
                  Hiring Timeline (Last 30 Days)
                </h2>
                <div
                  className="flex items-end gap-[2px] sm:gap-1"
                  style={{ height: "120px" }}
                >
                  {timelineLast30.map((day) => {
                    const heightPct = (day.postings / maxPostings) * 100;
                    return (
                      <div
                        key={day.date}
                        className="flex-1 min-w-[4px] rounded-t transition-all duration-300 group relative"
                        style={{
                          height: `${Math.max(heightPct, 3)}%`,
                          backgroundColor: "var(--cyan)",
                          opacity: heightPct > 0 ? 0.7 + (heightPct / 100) * 0.3 : 0.2,
                        }}
                        title={`${day.date}: ${day.postings} posting${day.postings !== 1 ? "s" : ""}`}
                      >
                        <div
                          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 rounded text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-10"
                          style={{
                            backgroundColor: "var(--bg-elevated)",
                            color: "var(--text-primary)",
                            border: "1px solid var(--border-default)",
                          }}
                        >
                          {day.date}: {day.postings}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div
                  className="flex justify-between mt-2 text-[10px]"
                  style={{ color: "var(--text-muted)" }}
                >
                  <span>
                    {timelineLast30[0]?.date ?? ""}
                  </span>
                  <span>
                    {timelineLast30[timelineLast30.length - 1]?.date ?? ""}
                  </span>
                </div>
              </section>
            )}

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <QuickStatCard
                label="Total Active"
                value={companyInfo.total_jobs.toLocaleString()}
                accent="var(--cyan)"
              />
              <QuickStatCard
                label="Categories"
                value={companyInfo.categories.length.toString()}
                accent="var(--purple)"
              />
              <QuickStatCard
                label="Remote %"
                value={
                  companyInfo.remote_pct != null
                    ? `${Math.round(companyInfo.remote_pct)}%`
                    : "--"
                }
                accent="var(--green)"
              />
              <QuickStatCard
                label="Avg Salary"
                value={
                  companyInfo.avg_salary_min && companyInfo.avg_salary_max
                    ? formatSalary(
                        Math.round(
                          (companyInfo.avg_salary_min +
                            companyInfo.avg_salary_max) /
                            2
                        )
                      )
                    : companyInfo.avg_salary_min
                      ? formatSalary(companyInfo.avg_salary_min)
                      : companyInfo.avg_salary_max
                        ? formatSalary(companyInfo.avg_salary_max)
                        : "--"
                }
                accent="var(--gold)"
              />
            </div>
          </div>
        )}

        {/* --- Open Roles Tab --- */}
        {activeTab === "roles" && (
          <div id="panel-roles" role="tabpanel" className="space-y-4">
            {/* Filter bar */}
            <div className="flex items-center gap-3 flex-wrap">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-200 appearance-none cursor-pointer"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-default)",
                }}
                aria-label="Filter by category"
              >
                <option value="all">All Categories</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => setRemoteOnly(!remoteOnly)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200"
                style={{
                  backgroundColor: remoteOnly
                    ? "var(--green-15)"
                    : "var(--bg-surface)",
                  color: remoteOnly ? "var(--green)" : "var(--text-secondary)",
                  border: `1px solid ${
                    remoteOnly ? "var(--green)" : "var(--border-default)"
                  }`,
                }}
                aria-pressed={remoteOnly}
              >
                <svg
                  className="w-4 h-4"
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
                    d="M2 8h12M8 2c-2 2-2 4-2 6s0 4 2 6M8 2c2 2 2 4 2 6s0 4-2 6"
                    stroke="currentColor"
                    strokeWidth="1.3"
                  />
                </svg>
                Remote Only
              </button>

              <span
                className="text-sm ml-auto"
                style={{ color: "var(--text-muted)" }}
              >
                Showing {filteredJobs.length} of {totalJobs} roles
              </span>
            </div>

            {/* Jobs grid */}
            {filteredJobs.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {filteredJobs.map((job) => (
                  <JobCard
                    key={job.job_id}
                    job={job}
                    companyTrajectory={intelReport ? trajectory : undefined}
                    onClick={() => router.push(`/seeker/jobs/${job.job_id}`)}
                  />
                ))}
              </div>
            ) : (
              <div
                className="card p-12 text-center"
                style={{ color: "var(--text-muted)" }}
              >
                <p className="text-sm">
                  No roles match the current filters.
                </p>
              </div>
            )}

            {/* Load more */}
            {jobs.length < totalJobs && (
              <div className="flex justify-center pt-4">
                <Button
                  variant="secondary"
                  size="md"
                  loading={jobsLoading}
                  onClick={loadMoreJobs}
                >
                  Load More Roles
                </Button>
              </div>
            )}
          </div>
        )}

        {/* --- Salary Intel Tab --- */}
        {activeTab === "salary" && (
          <div id="panel-salary" role="tabpanel" className="space-y-6">
            {/* Overall salary range */}
            <section className="card p-6">
              <h2
                className="text-xs font-semibold uppercase tracking-wider mb-4"
                style={{ color: "var(--text-muted)" }}
              >
                Company Salary Range
              </h2>
              <div className="flex items-center gap-4">
                <SalaryRange
                  min={companyInfo.avg_salary_min}
                  max={companyInfo.avg_salary_max}
                  showMarketComparison={false}
                />
              </div>
              <p
                className="text-xs mt-3"
                style={{ color: "var(--text-muted)" }}
              >
                Based on {companyInfo.total_jobs} tracked job postings with
                disclosed salary data.
              </p>
            </section>

            {/* Salary by category */}
            {salaryByCategory.length > 0 && (
              <section className="card p-6">
                <h2
                  className="text-xs font-semibold uppercase tracking-wider mb-4"
                  style={{ color: "var(--text-muted)" }}
                >
                  Salary by Category
                </h2>
                <div className="space-y-3">
                  {salaryByCategory.map((entry) => {
                    const widthPct = (entry.avg / maxSalary) * 100;
                    return (
                      <div key={entry.category}>
                        <div className="flex items-center justify-between mb-1">
                          <span
                            className="text-sm font-medium truncate"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {entry.category}
                          </span>
                          <span
                            className="font-mono text-sm font-bold shrink-0 ml-3"
                            style={{ color: "var(--green)" }}
                          >
                            {formatSalary(entry.avg)}
                          </span>
                        </div>
                        <div
                          className="w-full rounded-full overflow-hidden"
                          style={{
                            height: "8px",
                            backgroundColor: "var(--bg-elevated)",
                          }}
                        >
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{
                              width: `${widthPct}%`,
                              background:
                                "linear-gradient(90deg, var(--green), color-mix(in srgb, var(--green) 60%, var(--cyan)))",
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p
                  className="text-xs mt-4"
                  style={{ color: "var(--text-muted)" }}
                >
                  Average salary midpoint per category from disclosed salary
                  data. Actual compensation may vary based on location,
                  experience, and negotiation.
                </p>
              </section>
            )}

            {salaryByCategory.length === 0 && (
              <div
                className="card p-12 text-center"
                style={{ color: "var(--text-muted)" }}
              >
                <p className="text-sm">
                  No salary data available by category for this company.
                </p>
              </div>
            )}
          </div>
        )}

        {/* --- Signals Tab --- */}
        {activeTab === "signals" && (
          <div id="panel-signals" role="tabpanel" className="space-y-6">
            {/* Layoff Risk */}
            {layoffRisk && (
              <section className="card p-6">
                <h2
                  className="text-xs font-semibold uppercase tracking-wider mb-4"
                  style={{ color: "var(--text-muted)" }}
                >
                  Layoff Risk Assessment
                </h2>
                <div className="flex items-center gap-4 mb-4">
                  <RiskMeter
                    score={layoffRisk.risk_score}
                    level={layoffRisk.risk_level}
                  />
                  <div>
                    <p
                      className="text-sm font-semibold capitalize"
                      style={{
                        color:
                          layoffRisk.risk_level === "critical" ||
                          layoffRisk.risk_level === "high"
                            ? "var(--red)"
                            : layoffRisk.risk_level === "medium"
                              ? "var(--gold)"
                              : "var(--green)",
                      }}
                    >
                      {layoffRisk.risk_level} risk
                    </p>
                    <p
                      className="font-mono text-xs"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Score: {Math.round(layoffRisk.risk_score)}/100
                    </p>
                  </div>
                </div>

                {layoffRisk.signals.length > 0 && (
                  <div className="space-y-2 mb-4">
                    {layoffRisk.signals.map((s, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-3 p-3 rounded-lg"
                        style={{
                          backgroundColor: "var(--bg-elevated)",
                          border: "1px solid var(--border-subtle)",
                        }}
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0 mt-1.5"
                          style={{
                            backgroundColor:
                              s.severity === "high" || s.severity === "critical"
                                ? "var(--red)"
                                : s.severity === "medium"
                                  ? "var(--gold)"
                                  : "var(--green)",
                          }}
                        />
                        <div className="min-w-0">
                          <p
                            className="text-sm font-medium"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {s.signal}
                          </p>
                          {s.description && (
                            <p
                              className="text-xs mt-0.5"
                              style={{ color: "var(--text-muted)" }}
                            >
                              {s.description}
                            </p>
                          )}
                        </div>
                        <span
                          className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
                          style={{
                            backgroundColor:
                              s.severity === "high" || s.severity === "critical"
                                ? "var(--red-15)"
                                : s.severity === "medium"
                                  ? "var(--gold-15)"
                                  : "var(--green-15)",
                            color:
                              s.severity === "high" || s.severity === "critical"
                                ? "var(--red)"
                                : s.severity === "medium"
                                  ? "var(--gold)"
                                  : "var(--green)",
                          }}
                        >
                          {s.severity}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {layoffRisk.ai_assessment && (
                  <div
                    className="p-4 rounded-lg"
                    style={{
                      backgroundColor: "var(--bg-elevated)",
                      borderLeft: "3px solid var(--red)",
                    }}
                  >
                    <p
                      className="text-xs font-semibold uppercase tracking-wider mb-2"
                      style={{ color: "var(--text-muted)" }}
                    >
                      AI Assessment
                    </p>
                    <p
                      className="text-sm leading-relaxed"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {layoffRisk.ai_assessment}
                    </p>
                  </div>
                )}
              </section>
            )}

            {/* IPO Watch */}
            {ipoSignal && (
              <section className="card p-6">
                <h2
                  className="text-xs font-semibold uppercase tracking-wider mb-4"
                  style={{ color: "var(--text-muted)" }}
                >
                  IPO Watch
                </h2>
                <div className="flex items-center gap-4 mb-4">
                  <div
                    className="w-16 h-16 rounded-xl flex items-center justify-center"
                    style={{
                      backgroundColor: "var(--gold-15)",
                    }}
                  >
                    <span
                      className="font-display text-xl font-bold"
                      style={{ color: "var(--gold)" }}
                    >
                      {Math.round(ipoSignal.ipo_probability)}%
                    </span>
                  </div>
                  <div>
                    <p
                      className="text-sm font-semibold"
                      style={{ color: "var(--gold)" }}
                    >
                      IPO Probability
                    </p>
                    <p
                      className="text-xs capitalize"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Confidence: {ipoSignal.confidence}
                    </p>
                  </div>
                </div>

                {ipoSignal.signals.length > 0 && (
                  <div className="space-y-2 mb-4">
                    {ipoSignal.signals.map((s, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-3 p-3 rounded-lg"
                        style={{
                          backgroundColor: "var(--bg-elevated)",
                          border: "1px solid var(--border-subtle)",
                        }}
                      >
                        <svg
                          className="w-4 h-4 shrink-0 mt-0.5"
                          viewBox="0 0 16 16"
                          fill="none"
                          aria-hidden="true"
                          style={{ color: "var(--gold)" }}
                        >
                          <path
                            d="M2 12l4-5 3 3 5-7"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        <div className="min-w-0">
                          <p
                            className="text-sm font-medium"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {s.signal}
                          </p>
                          {s.description && (
                            <p
                              className="text-xs mt-0.5"
                              style={{ color: "var(--text-muted)" }}
                            >
                              {s.description}
                            </p>
                          )}
                        </div>
                        <span
                          className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
                          style={{
                            backgroundColor: "var(--gold-15)",
                            color: "var(--gold)",
                          }}
                        >
                          {s.strength}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {ipoSignal.ai_assessment && (
                  <div
                    className="p-4 rounded-lg"
                    style={{
                      backgroundColor: "var(--bg-elevated)",
                      borderLeft: "3px solid var(--gold)",
                    }}
                  >
                    <p
                      className="text-xs font-semibold uppercase tracking-wider mb-2"
                      style={{ color: "var(--text-muted)" }}
                    >
                      AI Assessment
                    </p>
                    <p
                      className="text-sm leading-relaxed"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {ipoSignal.ai_assessment}
                    </p>
                  </div>
                )}
              </section>
            )}

            {/* Ghost Analysis */}
            {intelReport?.ghost_analysis && (
              <section className="card p-6">
                <h2
                  className="text-xs font-semibold uppercase tracking-wider mb-4"
                  style={{ color: "var(--text-muted)" }}
                >
                  Ghost Job Analysis
                </h2>
                <div className="flex items-center gap-6 flex-wrap">
                  {intelReport.ghost_analysis.avg_ghost_score != null && (
                    <div className="flex items-center gap-3">
                      <GhostScore
                        score={Math.round(
                          intelReport.ghost_analysis.avg_ghost_score
                        )}
                        size="lg"
                        showLabel
                      />
                      <span
                        className="text-xs"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Avg ghost score
                      </span>
                    </div>
                  )}
                  {intelReport.ghost_analysis.ghost_rate != null && (
                    <div>
                      <p
                        className="font-display text-2xl"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {Math.round(intelReport.ghost_analysis.ghost_rate)}%
                      </p>
                      <p
                        className="text-xs"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Ghost rate
                      </p>
                    </div>
                  )}
                  {intelReport.ghost_analysis.total_analyzed != null && (
                    <div>
                      <p
                        className="font-display text-2xl"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {intelReport.ghost_analysis.total_analyzed}
                      </p>
                      <p
                        className="text-xs"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Postings analyzed
                      </p>
                    </div>
                  )}
                </div>
                <IntelligenceCard
                  type="ghost"
                  title={`Ghost Job Exposure for ${companyInfo.company}`}
                  body={
                    intelReport.ghost_analysis.ghost_rate != null
                      ? `${Math.round(intelReport.ghost_analysis.ghost_rate)}% of this company's postings show ghost job indicators. ${
                          intelReport.ghost_analysis.likely_ghost ?? 0
                        } postings flagged as likely ghost jobs out of ${
                          intelReport.ghost_analysis.total_analyzed ?? 0
                        } analyzed.`
                      : "Ghost analysis data is being processed for this company."
                  }
                  score={
                    intelReport.ghost_analysis.avg_ghost_score != null
                      ? Math.round(intelReport.ghost_analysis.avg_ghost_score)
                      : undefined
                  }
                  company={companyInfo.company}
                />
              </section>
            )}

            {/* Empty state */}
            {!layoffRisk && !ipoSignal && !intelReport?.ghost_analysis && (
              <div
                className="card p-12 text-center"
                style={{ color: "var(--text-muted)" }}
              >
                <svg
                  className="w-12 h-12 mx-auto mb-4"
                  viewBox="0 0 48 48"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle
                    cx="24"
                    cy="24"
                    r="20"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                  <path
                    d="M24 14v12M24 30h.01"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
                <p className="text-sm">
                  Signal intelligence is still being generated for this company.
                  Check back later.
                </p>
              </div>
            )}
          </div>
        )}

        {/* --- Culture Tab (Stub) --- */}
        {activeTab === "culture" && (
          <div id="panel-culture" role="tabpanel">
            <div className="card p-12 text-center">
              <svg
                className="w-16 h-16 mx-auto mb-4"
                viewBox="0 0 64 64"
                fill="none"
                aria-hidden="true"
                style={{ color: "var(--text-muted)" }}
              >
                <rect
                  x="8"
                  y="12"
                  width="48"
                  height="40"
                  rx="4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <path
                  d="M8 24h48"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <circle cx="20" cy="18" r="2" fill="currentColor" />
                <circle cx="28" cy="18" r="2" fill="currentColor" />
                <circle cx="36" cy="18" r="2" fill="currentColor" />
                <path
                  d="M24 36h16M28 42h8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              <h2
                className="text-lg font-display mb-2"
                style={{ color: "var(--text-primary)" }}
              >
                Coming Soon
              </h2>
              <p
                className="text-sm max-w-md mx-auto leading-relaxed"
                style={{ color: "var(--text-secondary)" }}
              >
                Culture insights from Glassdoor, Blind, and employee reviews are
                coming soon. This section will include sentiment analysis, work-life
                balance scores, management ratings, and growth opportunity
                assessments sourced from real employee feedback.
              </p>
              <div
                className="mt-6 p-4 rounded-lg max-w-sm mx-auto"
                style={{
                  backgroundColor: "var(--bg-elevated)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <p
                  className="text-xs font-semibold uppercase tracking-wider mb-2"
                  style={{ color: "var(--text-muted)" }}
                >
                  What to expect
                </p>
                <ul
                  className="text-xs space-y-1.5 text-left"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <li className="flex items-center gap-2">
                    <span
                      className="w-1 h-1 rounded-full shrink-0"
                      style={{ backgroundColor: "var(--cyan)" }}
                    />
                    Employee sentiment analysis
                  </li>
                  <li className="flex items-center gap-2">
                    <span
                      className="w-1 h-1 rounded-full shrink-0"
                      style={{ backgroundColor: "var(--cyan)" }}
                    />
                    Work-life balance scores
                  </li>
                  <li className="flex items-center gap-2">
                    <span
                      className="w-1 h-1 rounded-full shrink-0"
                      style={{ backgroundColor: "var(--cyan)" }}
                    />
                    Management and leadership ratings
                  </li>
                  <li className="flex items-center gap-2">
                    <span
                      className="w-1 h-1 rounded-full shrink-0"
                      style={{ backgroundColor: "var(--cyan)" }}
                    />
                    Compensation satisfaction trends
                  </li>
                  <li className="flex items-center gap-2">
                    <span
                      className="w-1 h-1 rounded-full shrink-0"
                      style={{ backgroundColor: "var(--cyan)" }}
                    />
                    Interview process insights
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </main>

      <MobileNav />
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatBlock — compact stat used in the header
// ---------------------------------------------------------------------------

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p
        className="text-xs font-medium mb-1"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </p>
      <p
        className="text-sm font-semibold"
        style={{ color: "var(--text-primary)" }}
      >
        {value}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// QuickStatCard — used in overview grid
// ---------------------------------------------------------------------------

function QuickStatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div
      className="card p-5 relative overflow-hidden"
      style={{ borderTop: `2px solid ${accent}` }}
    >
      <p
        className="text-xs font-medium mb-1"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </p>
      <p
        className="font-display text-2xl"
        style={{ color: "var(--text-primary)" }}
      >
        {value}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RiskMeter — circular risk indicator for layoff risk
// ---------------------------------------------------------------------------

function RiskMeter({
  score,
  level,
}: {
  score: number;
  level: string;
}) {
  const normalized = Math.min(Math.max(score, 0), 100);
  const circumference = 2 * Math.PI * 22;
  const offset = circumference - (normalized / 100) * circumference;

  const color =
    level === "critical" || level === "high"
      ? "var(--red)"
      : level === "medium"
        ? "var(--gold)"
        : "var(--green)";

  return (
    <div className="relative w-16 h-16 shrink-0">
      <svg className="w-16 h-16 -rotate-90" viewBox="0 0 48 48">
        <circle
          cx="24"
          cy="24"
          r="22"
          fill="none"
          stroke="var(--bg-elevated)"
          strokeWidth="3"
        />
        <circle
          cx="24"
          cy="24"
          r="22"
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700"
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center font-mono text-sm font-bold"
        style={{ color }}
      >
        {Math.round(normalized)}
      </span>
    </div>
  );
}
