"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { TopNav } from "@/components/layout/top-nav";
import { MobileNav } from "@/components/layout/mobile-nav";
import { JobCard } from "@/components/job/job-card";
import { GhostScore } from "@/components/ui/ghost-score";
import { SalaryRange } from "@/components/ui/salary-range";
import { Button } from "@/components/ui/button";
import { LiveCounter } from "@/components/ui/live-counter";
import { ApplyModal } from "@/components/job/apply-modal";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  ghost_score?: number | null;
  posted_at?: string;
  required_skills?: string;
  source?: string;
  apply_link?: string;
  description?: string;
  external_applicant_count?: number | null;
  internal_applicant_count?: number | null;
}

interface JobsResponse {
  items: Job[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}

interface Stats {
  total_jobs: number;
  unique_companies: number;
  markets: number;
  with_salary: number;
}

interface Market {
  market_id: string;
  total_jobs: number;
  unique_companies: number;
  categories_active: number;
  remote_jobs: number;
  remote_pct: number;
  avg_salary: number;
}

interface Filters {
  query: string;
  market_id: string;
  category: string;
  is_remote: boolean | null;
  min_salary: number;
  freshness: string;
  hideGhosts: boolean;
}

type SortOption = "newest" | "salary_high" | "ghost_low";

const CATEGORIES = [
  { label: "Software Engineer", value: "software engineer" },
  { label: "Data Scientist", value: "data scientist" },
  { label: "Data Engineer", value: "data engineer" },
  { label: "AI Engineer", value: "AI engineer" },
  { label: "ML Engineer", value: "machine learning engineer" },
  { label: "Frontend Developer", value: "frontend developer" },
  { label: "Backend Developer", value: "backend developer" },
  { label: "Full Stack Developer", value: "full stack developer" },
  { label: "DevOps Engineer", value: "devops engineer" },
  { label: "Cloud Engineer", value: "cloud engineer" },
  { label: "Cybersecurity", value: "cybersecurity" },
  { label: "Product Manager", value: "product manager" },
  { label: "Mobile Developer", value: "mobile developer" },
  { label: "QA Engineer", value: "QA engineer" },
  { label: "UX Designer", value: "UX designer" },
  { label: "Systems Engineer", value: "systems engineer" },
];

const PER_PAGE = 20;

const DEFAULT_FILTERS: Filters = {
  query: "",
  market_id: "",
  category: "",
  is_remote: null,
  min_salary: 0,
  freshness: "",
  hideGhosts: false,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatSalaryLabel(value: number): string {
  if (value === 0) return "$0";
  if (value >= 1000) return `$${value / 1000}K`;
  return `$${value}`;
}

function activeFilterCount(filters: Filters): number {
  let count = 0;
  if (filters.query) count++;
  if (filters.market_id) count++;
  if (filters.category) count++;
  if (filters.is_remote !== null) count++;
  if (filters.min_salary > 0) count++;
  if (filters.freshness) count++;
  if (filters.hideGhosts) count++;
  return count;
}

function sortJobs(jobs: Job[], sortBy: SortOption): Job[] {
  const sorted = [...jobs];
  switch (sortBy) {
    case "salary_high":
      sorted.sort((a, b) => {
        const aMax = a.salary_max ?? a.salary_min ?? 0;
        const bMax = b.salary_max ?? b.salary_min ?? 0;
        return (bMax ?? 0) - (aMax ?? 0);
      });
      break;
    case "ghost_low":
      sorted.sort((a, b) => (a.ghost_score ?? 50) - (b.ghost_score ?? 50));
      break;
    case "newest":
    default:
      sorted.sort((a, b) => {
        const aDate = a.posted_at ? new Date(a.posted_at).getTime() : 0;
        const bDate = b.posted_at ? new Date(b.posted_at).getTime() : 0;
        return bDate - aDate;
      });
      break;
  }
  return sorted;
}

function parseSkillsList(skills?: string): string[] {
  if (!skills) return [];
  return skills
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SeekerJobSearchPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  // Data state
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [applyJob, setApplyJob] = useState<Job | null>(null);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);

  // Filter state
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // Pagination state
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalResults, setTotalResults] = useState(0);

  // Loading / error state
  const [initialLoading, setInitialLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Refs
  const sentinelRef = useRef<HTMLDivElement>(null);
  const feedContainerRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- Auth guard ----
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  // ---- Load markets + stats on mount ----
  useEffect(() => {
    api.get<Market[]>("/jobs/markets").then(setMarkets).catch(() => {});
    api.get<Stats>("/jobs/stats").then(setStats).catch(() => {});
  }, []);

  // ---- Debounce search query ----
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedQuery(filters.query);
    }, 300);
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [filters.query]);

  // ---- Reset page when filters change ----
  useEffect(() => {
    setPage(1);
    setJobs([]);
    setSelectedJob(null);
    setHasMore(true);
  }, [
    debouncedQuery,
    filters.market_id,
    filters.category,
    filters.is_remote,
    filters.min_salary,
    filters.freshness,
    filters.hideGhosts,
  ]);

  // ---- Fetch jobs ----
  const fetchJobs = useCallback(
    async (pageNum: number, append: boolean) => {
      if (!append) setInitialLoading(true);
      setLoading(true);

      try {
        setError(null);
        const params = new URLSearchParams();
        params.set("page", String(pageNum));
        params.set("per_page", String(PER_PAGE));

        if (debouncedQuery) params.set("query", debouncedQuery);
        if (filters.market_id) params.set("market_id", filters.market_id);
        if (filters.category) params.set("category", filters.category);
        if (filters.is_remote === true) params.set("is_remote", "true");
        if (filters.min_salary > 0)
          params.set("min_salary", String(filters.min_salary));
        if (filters.freshness) params.set("freshness", filters.freshness);

        const data = await api.get<JobsResponse>(
          `/jobs?${params.toString()}`
        );

        const newJobs = data.items || [];
        setTotalResults(data.total || 0);
        setHasMore(pageNum < (data.pages || 1));

        if (append) {
          setJobs((prev) => [...prev, ...newJobs]);
        } else {
          setJobs(newJobs);
          if (newJobs.length > 0) {
            setSelectedJob(newJobs[0]);
          }
        }
      } catch (err) {
        if (!append) {
          setError("Failed to load jobs. Please try again.");
        }
        console.error("Job search error:", err);
      } finally {
        setLoading(false);
        setInitialLoading(false);
      }
    },
    [debouncedQuery, filters.market_id, filters.category, filters.is_remote, filters.min_salary, filters.freshness]
  );

  useEffect(() => {
    fetchJobs(page, page > 1);
  }, [page, fetchJobs]);

  // ---- Infinite scroll ----
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          setPage((prev) => prev + 1);
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading]);

  // ---- Derived: filtered + sorted jobs ----
  const displayJobs = useMemo(() => {
    let result = jobs;
    if (filters.hideGhosts) {
      result = result.filter(
        (j) => j.ghost_score == null || j.ghost_score <= 60
      );
    }
    return sortJobs(result, sortBy);
  }, [jobs, filters.hideGhosts, sortBy]);

  // ---- Computed stats for sidebar ----
  const remotePercent = useMemo(() => {
    if (!stats || stats.total_jobs === 0) return 0;
    const remoteMarkets = markets.reduce((sum, m) => sum + m.remote_jobs, 0);
    return stats.total_jobs > 0
      ? Math.round((remoteMarkets / stats.total_jobs) * 100)
      : 0;
  }, [stats, markets]);

  // ---- Filter update helper ----
  const updateFilter = <K extends keyof Filters>(
    key: K,
    value: Filters[K]
  ) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters(DEFAULT_FILTERS);
  };

  const filterCount = activeFilterCount(filters);

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

      <main className="flex flex-1 overflow-hidden">
        {/* ================================================================
            MOBILE FILTER DRAWER OVERLAY
            ================================================================ */}
        {filtersOpen && (
          <div
            className="fixed inset-0 z-40 md:hidden"
            style={{ backgroundColor: "rgba(3, 5, 8, 0.7)" }}
            onClick={() => setFiltersOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* ================================================================
            LEFT PANEL — FILTER SIDEBAR
            ================================================================ */}
        <aside
          className={[
            "shrink-0 overflow-y-auto",
            // Desktop: always visible
            "hidden md:flex md:flex-col",
            // Mobile: slide-out drawer
          ].join(" ")}
          style={{
            width: "260px",
            backgroundColor: "var(--bg-surface)",
            borderRight: "1px solid var(--border-subtle)",
          }}
        >
          <FilterSidebarContent
            filters={filters}
            updateFilter={updateFilter}
            clearFilters={clearFilters}
            filterCount={filterCount}
            stats={stats}
            markets={markets}
            remotePercent={remotePercent}
          />
        </aside>

        {/* Mobile filter drawer */}
        <aside
          className={[
            "fixed inset-y-0 left-0 z-50 overflow-y-auto md:hidden",
            "transition-transform duration-300 ease-out",
            filtersOpen ? "translate-x-0" : "-translate-x-full",
          ].join(" ")}
          style={{
            width: "300px",
            backgroundColor: "var(--bg-surface)",
            borderRight: "1px solid var(--border-subtle)",
          }}
        >
          <div
            className="flex items-center justify-between px-4 h-14"
            style={{ borderBottom: "1px solid var(--border-subtle)" }}
          >
            <span
              className="font-semibold text-sm"
              style={{ color: "var(--text-primary)" }}
            >
              Filters
              {filterCount > 0 && (
                <span
                  className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-mono"
                  style={{
                    backgroundColor: "var(--cyan-15)",
                    color: "var(--cyan)",
                  }}
                >
                  {filterCount}
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={() => setFiltersOpen(false)}
              className="p-1 rounded-lg"
              style={{ color: "var(--text-secondary)" }}
              aria-label="Close filters"
            >
              <svg
                className="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
          <FilterSidebarContent
            filters={filters}
            updateFilter={updateFilter}
            clearFilters={clearFilters}
            filterCount={filterCount}
            stats={stats}
            markets={markets}
            remotePercent={remotePercent}
          />
        </aside>

        {/* ================================================================
            CENTER PANEL — JOB FEED
            ================================================================ */}
        <section
          ref={feedContainerRef}
          className="flex-1 flex flex-col overflow-y-auto"
          style={{ backgroundColor: "var(--bg-deep)" }}
        >
          {/* Feed header */}
          <div
            className="sticky top-0 z-10 glass px-4 py-3 flex items-center justify-between gap-3 flex-wrap"
            style={{ borderBottom: "1px solid var(--border-subtle)" }}
          >
            <div className="flex items-center gap-3">
              {/* Mobile filter toggle */}
              <button
                type="button"
                onClick={() => setFiltersOpen(true)}
                className="md:hidden inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border-subtle)",
                }}
                aria-label="Open filters"
              >
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M2 4h12M4 8h8M6 12h4"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                  />
                </svg>
                Filters
                {filterCount > 0 && (
                  <span
                    className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-mono"
                    style={{
                      backgroundColor: "var(--cyan)",
                      color: "var(--text-inverse)",
                    }}
                  >
                    {filterCount}
                  </span>
                )}
              </button>

              <span
                className="text-sm font-medium"
                style={{ color: "var(--text-secondary)" }}
              >
                {initialLoading
                  ? "Loading..."
                  : `${totalResults.toLocaleString()} jobs found`}
              </span>
            </div>

            {/* Sort dropdown */}
            <div className="flex items-center gap-2">
              <label
                htmlFor="sort-select"
                className="text-xs sr-only"
              >
                Sort by
              </label>
              <select
                id="sort-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="text-xs rounded-lg px-3 py-1.5 outline-none cursor-pointer"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <option value="newest">Newest First</option>
                <option value="salary_high">Salary: High to Low</option>
                <option value="ghost_low">Ghost Score: Low to High</option>
              </select>
            </div>
          </div>

          {/* Job list */}
          <div className="flex-1 px-4 py-4 space-y-3">
            {initialLoading ? (
              // Skeleton loading state
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="card shimmer rounded-lg"
                    style={{ height: "180px" }}
                  />
                ))}
              </div>
            ) : error ? (
              // Error state
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <svg
                  className="w-16 h-16 mb-4"
                  viewBox="0 0 64 64"
                  fill="none"
                  aria-hidden="true"
                  style={{ color: "var(--red)" }}
                >
                  <circle
                    cx="32"
                    cy="32"
                    r="24"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <path
                    d="M32 20v16M32 42v2"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
                <h3
                  className="text-lg font-semibold mb-2"
                  style={{ color: "var(--text-primary)" }}
                >
                  {error}
                </h3>
                <p
                  className="text-sm mb-6 max-w-md"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Check your connection and try again.
                </p>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => fetchJobs(1, false)}
                >
                  Retry
                </Button>
              </div>
            ) : displayJobs.length === 0 ? (
              // Empty state
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <svg
                  className="w-16 h-16 mb-4"
                  viewBox="0 0 64 64"
                  fill="none"
                  aria-hidden="true"
                  style={{ color: "var(--text-muted)" }}
                >
                  <circle
                    cx="28"
                    cy="28"
                    r="18"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <path
                    d="M42 42l14 14"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <path
                    d="M22 28h12M28 22v12"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    opacity="0.4"
                  />
                </svg>
                <h3
                  className="text-lg font-semibold mb-2"
                  style={{ color: "var(--text-primary)" }}
                >
                  No jobs found matching your criteria.
                </h3>
                <p
                  className="text-sm mb-6 max-w-md"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Try adjusting your filters or broadening your search.
                </p>
                <Button variant="secondary" size="sm" onClick={clearFilters}>
                  Clear Filters
                </Button>
              </div>
            ) : (
              // Job cards
              <>
                {displayJobs.map((job) => (
                  <JobCard
                    key={job.job_id}
                    job={job}
                    mode="full"
                    selected={selectedJob?.job_id === job.job_id}
                    onClick={() => setSelectedJob(job)}
                    onApply={() => setApplyJob(job)}
                    onSave={() => {
                      // Save functionality placeholder
                    }}
                    onAnalyze={() => {
                      router.push(`/seeker/jobs/${job.job_id}`);
                    }}
                  />
                ))}

                {/* Infinite scroll sentinel */}
                <div ref={sentinelRef} className="h-1" />

                {/* Loading more indicator */}
                {loading && !initialLoading && (
                  <div className="space-y-3 pt-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div
                        key={`loading-${i}`}
                        className="card shimmer rounded-lg"
                        style={{ height: "180px" }}
                      />
                    ))}
                  </div>
                )}

                {/* End of results */}
                {!hasMore && displayJobs.length > 0 && (
                  <p
                    className="text-center text-xs py-6"
                    style={{ color: "var(--text-muted)" }}
                  >
                    All {totalResults.toLocaleString()} results loaded
                  </p>
                )}
              </>
            )}
          </div>
        </section>

        {/* ================================================================
            RIGHT PANEL — PREVIEW (desktop only)
            ================================================================ */}
        <aside
          className="hidden lg:flex flex-col shrink-0 overflow-y-auto"
          style={{
            width: "400px",
            backgroundColor: "var(--bg-surface)",
            borderLeft: "1px solid var(--border-subtle)",
          }}
        >
          {selectedJob ? (
            <PreviewPanel
              job={selectedJob}
              onApply={() => setApplyJob(selectedJob)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <svg
                className="w-12 h-12 mb-4"
                viewBox="0 0 48 48"
                fill="none"
                aria-hidden="true"
                style={{ color: "var(--text-muted)" }}
              >
                <rect
                  x="6"
                  y="6"
                  width="36"
                  height="36"
                  rx="4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <path
                  d="M6 16h36"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <rect
                  x="12"
                  y="22"
                  width="24"
                  height="3"
                  rx="1.5"
                  fill="currentColor"
                  opacity="0.3"
                />
                <rect
                  x="12"
                  y="29"
                  width="16"
                  height="3"
                  rx="1.5"
                  fill="currentColor"
                  opacity="0.2"
                />
                <rect
                  x="12"
                  y="36"
                  width="20"
                  height="3"
                  rx="1.5"
                  fill="currentColor"
                  opacity="0.15"
                />
              </svg>
              <p
                className="text-sm font-medium"
                style={{ color: "var(--text-secondary)" }}
              >
                Select a job to see details
              </p>
              <p
                className="text-xs mt-1"
                style={{ color: "var(--text-muted)" }}
              >
                Click on any job card to preview it here
              </p>
            </div>
          )}
        </aside>
      </main>

      <MobileNav />

      {/* Native Apply Modal — never redirects to external sites */}
      {applyJob && (
        <ApplyModal
          job={applyJob}
          open={!!applyJob}
          onClose={() => setApplyJob(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filter Sidebar Content (shared between desktop and mobile drawer)
// ---------------------------------------------------------------------------

function FilterSidebarContent({
  filters,
  updateFilter,
  clearFilters,
  filterCount,
  stats,
  markets,
  remotePercent,
}: {
  filters: Filters;
  updateFilter: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
  clearFilters: () => void;
  filterCount: number;
  stats: Stats | null;
  markets: Market[];
  remotePercent: number;
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Stats bar */}
      <div
        className="px-4 py-4"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div className="grid grid-cols-3 gap-2">
          <StatMini
            value={stats?.total_jobs ?? 0}
            label="Jobs"
          />
          <StatMini
            value={stats?.with_salary ?? 0}
            label="With Salary"
          />
          <StatMini
            value={remotePercent}
            label="Remote %"
            suffix="%"
          />
        </div>
      </div>

      {/* Scrollable filter sections */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {/* Search input */}
        <FilterSection title="Search">
          <div
            className="relative rounded-lg"
            style={{
              backgroundColor: "var(--bg-elevated)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
              style={{ color: "var(--text-muted)" }}
            >
              <circle
                cx="7"
                cy="7"
                r="5"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path
                d="M11 11l3 3"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            <input
              type="text"
              placeholder="Title, company, skills..."
              value={filters.query}
              onChange={(e) => updateFilter("query", e.target.value)}
              className="w-full bg-transparent pl-8 pr-3 py-2 text-xs outline-none"
              style={{ color: "var(--text-primary)" }}
              aria-label="Search jobs"
            />
          </div>
        </FilterSection>

        {/* Market dropdown */}
        <FilterSection title="Market">
          <select
            value={filters.market_id}
            onChange={(e) => updateFilter("market_id", e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-xs outline-none cursor-pointer"
            style={{
              backgroundColor: "var(--bg-elevated)",
              color: filters.market_id
                ? "var(--text-primary)"
                : "var(--text-muted)",
              border: "1px solid var(--border-subtle)",
            }}
            aria-label="Select market"
          >
            <option value="">All Markets</option>
            {markets.map((m) => (
              <option key={m.market_id} value={m.market_id}>
                {m.market_id} ({m.total_jobs.toLocaleString()} jobs)
              </option>
            ))}
          </select>
        </FilterSection>

        {/* Category checkboxes */}
        <FilterSection title="Category">
          <div className="space-y-1.5">
            {CATEGORIES.map((cat) => (
              <label
                key={cat.value}
                className="flex items-center gap-2 cursor-pointer group"
              >
                <input
                  type="radio"
                  name="category"
                  checked={filters.category === cat.value}
                  onChange={() =>
                    updateFilter(
                      "category",
                      filters.category === cat.value ? "" : cat.value
                    )
                  }
                  className="sr-only"
                />
                <span
                  className="w-3.5 h-3.5 rounded-sm border flex items-center justify-center shrink-0 transition-colors"
                  style={{
                    borderColor:
                      filters.category === cat.value
                        ? "var(--cyan)"
                        : "var(--border-default)",
                    backgroundColor:
                      filters.category === cat.value
                        ? "var(--cyan-15)"
                        : "transparent",
                  }}
                >
                  {filters.category === cat.value && (
                    <svg
                      className="w-2.5 h-2.5"
                      viewBox="0 0 12 12"
                      fill="none"
                      aria-hidden="true"
                      style={{ color: "var(--cyan)" }}
                    >
                      <path
                        d="M2 6l3 3 5-6"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </span>
                <span
                  className="text-xs transition-colors"
                  style={{
                    color:
                      filters.category === cat.value
                        ? "var(--text-primary)"
                        : "var(--text-secondary)",
                  }}
                >
                  {cat.label}
                </span>
              </label>
            ))}
          </div>
        </FilterSection>

        {/* Employment type toggles */}
        <FilterSection title="Employment">
          <div className="space-y-2">
            <ToggleSwitch
              label="Remote"
              checked={filters.is_remote === true}
              onChange={(checked) =>
                updateFilter("is_remote", checked ? true : null)
              }
            />
          </div>
        </FilterSection>

        {/* Salary minimum slider */}
        <FilterSection title="Minimum Salary">
          <div className="space-y-2">
            <input
              type="range"
              min={0}
              max={300000}
              step={10000}
              value={filters.min_salary}
              onChange={(e) =>
                updateFilter("min_salary", Number(e.target.value))
              }
              className="w-full accent-[var(--cyan)]"
              style={{ height: "4px" }}
              aria-label="Minimum salary"
            />
            <div className="flex items-center justify-between">
              <span
                className="text-xs font-mono"
                style={{ color: "var(--text-muted)" }}
              >
                $0
              </span>
              <span
                className="text-xs font-mono font-medium"
                style={{
                  color:
                    filters.min_salary > 0
                      ? "var(--green)"
                      : "var(--text-muted)",
                }}
              >
                {filters.min_salary > 0
                  ? formatSalaryLabel(filters.min_salary)
                  : "Any"}
              </span>
              <span
                className="text-xs font-mono"
                style={{ color: "var(--text-muted)" }}
              >
                $300K
              </span>
            </div>
          </div>
        </FilterSection>

        {/* Freshness radio buttons */}
        <FilterSection title="Date Posted">
          <div className="flex flex-wrap gap-1.5">
            {[
              { value: "", label: "All" },
              { value: "today", label: "Today" },
              { value: "3days", label: "3 Days" },
              { value: "week", label: "This Week" },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => updateFilter("freshness", opt.value)}
                className="px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-150"
                style={{
                  backgroundColor:
                    filters.freshness === opt.value
                      ? "var(--cyan-15)"
                      : "var(--bg-elevated)",
                  color:
                    filters.freshness === opt.value
                      ? "var(--cyan)"
                      : "var(--text-secondary)",
                  border: `1px solid ${
                    filters.freshness === opt.value
                      ? "var(--cyan-40)"
                      : "var(--border-subtle)"
                  }`,
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </FilterSection>

        {/* Ghost filter */}
        <FilterSection title="Quality">
          <ToggleSwitch
            label="Hide suspicious jobs (ghost score > 60)"
            checked={filters.hideGhosts}
            onChange={(checked) => updateFilter("hideGhosts", checked)}
          />
        </FilterSection>
      </div>

      {/* Clear all button */}
      <div
        className="px-4 py-3 shrink-0"
        style={{ borderTop: "1px solid var(--border-subtle)" }}
      >
        <button
          type="button"
          onClick={clearFilters}
          disabled={filterCount === 0}
          className="w-full px-3 py-2 rounded-lg text-xs font-medium transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed"
          style={{
            backgroundColor: "var(--bg-elevated)",
            color: "var(--text-secondary)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          Clear all filters
          {filterCount > 0 && (
            <span
              className="ml-2 inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-mono"
              style={{
                backgroundColor: "var(--cyan)",
                color: "var(--text-inverse)",
              }}
            >
              {filterCount}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Preview Panel
// ---------------------------------------------------------------------------

function PreviewPanel({
  job,
  onApply,
}: {
  job: Job;
  onApply: () => void;
}) {
  const skills = parseSkillsList(job.required_skills);
  const letterColor = getLettermarkColor(job.company);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="px-5 py-5"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div className="flex items-start gap-3">
          {job.company_logo ? (
            <img
              src={job.company_logo}
              alt={`${job.company} logo`}
              className="w-12 h-12 rounded-lg object-contain shrink-0"
              style={{
                backgroundColor: "var(--bg-elevated)",
                border: "1px solid var(--border-subtle)",
              }}
            />
          ) : (
            <div
              className="w-12 h-12 rounded-lg flex items-center justify-center font-display text-lg shrink-0"
              style={{
                backgroundColor: `color-mix(in srgb, ${letterColor} 15%, transparent)`,
                color: letterColor,
                border: `1px solid color-mix(in srgb, ${letterColor} 25%, transparent)`,
              }}
            >
              {job.company.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p
              className="text-sm font-medium"
              style={{ color: "var(--text-secondary)" }}
            >
              {job.company}
            </p>
            <h2
              className="text-lg font-semibold leading-snug mt-0.5"
              style={{ color: "var(--text-primary)" }}
            >
              {job.title}
            </h2>
            {(job.location || job.is_remote) && (
              <p
                className="text-xs mt-1 flex items-center gap-2"
                style={{ color: "var(--text-muted)" }}
              >
                {job.location && <span>{job.location}</span>}
                {job.is_remote && (
                  <span
                    className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                    style={{
                      backgroundColor: "var(--green-08)",
                      color: "var(--green)",
                    }}
                  >
                    Remote
                  </span>
                )}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Ghost Score */}
      {job.ghost_score != null && (
        <div
          className="px-5 py-4"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <GhostScore score={job.ghost_score} size="lg" showLabel />
        </div>
      )}

      {/* Salary */}
      <div
        className="px-5 py-4"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <p
          className="text-xs font-medium mb-2 uppercase tracking-wide"
          style={{ color: "var(--text-muted)" }}
        >
          Compensation
        </p>
        <SalaryRange min={job.salary_min} max={job.salary_max} />
      </div>

      {/* Skills */}
      {skills.length > 0 && (
        <div
          className="px-5 py-4"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <p
            className="text-xs font-medium mb-2 uppercase tracking-wide"
            style={{ color: "var(--text-muted)" }}
          >
            Required Skills
          </p>
          <div className="flex flex-wrap gap-1.5">
            {skills.map((skill) => (
              <span
                key={skill}
                className="px-2.5 py-1 rounded-md text-xs font-medium"
                style={{
                  backgroundColor: "var(--cyan-08)",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Description */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <p
          className="text-xs font-medium mb-2 uppercase tracking-wide"
          style={{ color: "var(--text-muted)" }}
        >
          Description
        </p>
        {job.description ? (
          <div
            className="text-sm leading-relaxed prose-invert"
            style={{ color: "var(--text-secondary)" }}
            dangerouslySetInnerHTML={{ __html: job.description }}
          />
        ) : (
          <p
            className="text-sm italic"
            style={{ color: "var(--text-muted)" }}
          >
            No description available. Click "Open Full Page" for more details.
          </p>
        )}
      </div>

      {/* Actions */}
      <div
        className="px-5 py-4 space-y-2 shrink-0"
        style={{ borderTop: "1px solid var(--border-subtle)" }}
      >
        <Button
          variant="primary"
          size="md"
          className="w-full"
          onClick={onApply}
        >
          <svg
            className="w-4 h-4"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M14 2l-7 7M14 2l-4 12-3-5-5-3 12-4z"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Apply Now
        </Button>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" className="flex-1">
            <svg
              className="w-3.5 h-3.5"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M3 2h10a1 1 0 011 1v11.5l-5-3-5 3V3a1 1 0 011-1z"
                stroke="currentColor"
                strokeWidth="1.3"
              />
            </svg>
            Save
          </Button>
          <Button variant="secondary" size="sm" className="flex-1">
            <svg
              className="w-3.5 h-3.5"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M2 12l4-5 3 3 5-7"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Analyze
          </Button>
        </div>
        <Link
          href={`/seeker/jobs/${job.job_id}`}
          className="block w-full text-center px-3 py-2 rounded-lg text-xs font-medium transition-colors duration-150"
          style={{
            color: "var(--cyan)",
            backgroundColor: "var(--cyan-08)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          Open Full Page
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

function FilterSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p
        className="text-[10px] font-semibold uppercase tracking-widest mb-2"
        style={{ color: "var(--text-muted)" }}
      >
        {title}
      </p>
      {children}
    </div>
  );
}

function ToggleSwitch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer group">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="relative inline-flex items-center w-8 h-[18px] rounded-full transition-colors duration-200 shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cyan)]"
        style={{
          backgroundColor: checked ? "var(--cyan)" : "var(--bg-overlay)",
        }}
      >
        <span
          className="block w-3.5 h-3.5 rounded-full transition-transform duration-200"
          style={{
            backgroundColor: checked
              ? "var(--text-inverse)"
              : "var(--text-muted)",
            transform: checked ? "translateX(15px)" : "translateX(2px)",
          }}
        />
      </button>
      <span
        className="text-xs transition-colors"
        style={{
          color: checked ? "var(--text-primary)" : "var(--text-secondary)",
        }}
      >
        {label}
      </span>
    </label>
  );
}

function StatMini({
  value,
  label,
  suffix = "",
}: {
  value: number;
  label: string;
  suffix?: string;
}) {
  return (
    <div className="text-center">
      <p
        className="text-sm font-display tabular-nums"
        style={{ color: "var(--text-primary)" }}
      >
        {value > 0 ? value.toLocaleString() : "--"}
        {suffix}
      </p>
      <p
        className="text-[10px]"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Utility shared with job-card.tsx
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
