"use client";
import { useEffect, useState, useCallback } from "react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";

interface ScraperRun {
  id: number;
  source: string;
  status: string;
  jobs_found: number;
  jobs_inserted: number;
  jobs_updated: number;
  error_message: string | null;
  finished_at: string;
}

interface SourceCount {
  source: string;
  count: number;
}

interface CategoryCount {
  search_category: string;
  count: number;
}

interface ScraperStats {
  total_jobs: number;
  by_source: SourceCount[];
  by_category: CategoryCount[];
  added_last_24h: number;
  added_last_7d: number;
  added_last_30d: number;
}

const SCRAPER_GROUPS = [
  "fast_scrapers",
  "standard_scrapers",
  "board_scrapers",
  "ashby_scraper",
  "hn_scraper",
  "jsearch_daily",
];

export default function ScrapersPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<ScraperStats | null>(null);
  const [runs, setRuns] = useState<ScraperRun[]>([]);
  const [triggering, setTriggering] = useState<string | null>(null);

  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const headers: Record<string, string> = token
    ? { Authorization: `Bearer ${token}` }
    : {};

  const fetchData = useCallback(() => {
    if (!token) return;
    fetch("/api/v1/admin/scrapers/stats", { headers })
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
    fetch("/api/v1/admin/scrapers/status", { headers })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setRuns(data);
      })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const runAll = async () => {
    setTriggering("all");
    try {
      await fetch("/api/v1/admin/scrapers/run-all", {
        method: "POST",
        headers,
      });
    } catch {
      /* ignore */
    }
    setTimeout(() => {
      setTriggering(null);
      fetchData();
    }, 3000);
  };

  const runGroup = async (group: string) => {
    setTriggering(group);
    try {
      await fetch(`/api/v1/admin/scrapers/run/${group}`, {
        method: "POST",
        headers,
      });
    } catch {
      /* ignore */
    }
    setTimeout(() => {
      setTriggering(null);
      fetchData();
    }, 2000);
  };

  if (loading || !user) return null;

  const cardStyle = { backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" };

  return (
    <DashboardShell>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Scraper Dashboard</h1>
        <button
          onClick={runAll}
          disabled={triggering === "all"}
          className="px-4 py-2 text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          style={{ backgroundColor: "var(--cyan)", color: "var(--bg-void)" }}
        >
          {triggering === "all" ? "Running All..." : "Run All Scrapers"}
        </button>
      </div>

      {/* Big stats */}
      {stats && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="rounded-xl p-4" style={cardStyle}>
              <p className="text-xs uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
                Total Jobs
              </p>
              <p className="text-3xl font-bold" style={{ color: "var(--text-primary)" }}>
                {stats.total_jobs.toLocaleString()}
              </p>
            </div>
            <div className="rounded-xl p-4" style={cardStyle}>
              <p className="text-xs uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
                Last 24h
              </p>
              <p className="text-3xl font-bold" style={{ color: "var(--green)" }}>
                +{stats.added_last_24h.toLocaleString()}
              </p>
            </div>
            <div className="rounded-xl p-4" style={cardStyle}>
              <p className="text-xs uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
                Last 7 Days
              </p>
              <p className="text-3xl font-bold" style={{ color: "var(--cyan)" }}>
                +{stats.added_last_7d.toLocaleString()}
              </p>
            </div>
            <div className="rounded-xl p-4" style={cardStyle}>
              <p className="text-xs uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
                Last 30 Days
              </p>
              <p className="text-3xl font-bold" style={{ color: "var(--gold)" }}>
                +{stats.added_last_30d.toLocaleString()}
              </p>
            </div>
          </div>

          {/* By Source + By Category */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Jobs by Source */}
            <div className="rounded-xl overflow-hidden" style={cardStyle}>
              <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <span className="font-medium" style={{ color: "var(--text-primary)" }}>Jobs by Source</span>
              </div>
              <div className="max-h-80 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      <th className="px-4 py-2 text-left" style={{ color: "var(--text-muted)" }}>Source</th>
                      <th className="px-4 py-2 text-right" style={{ color: "var(--text-muted)" }}>Count</th>
                      <th className="px-4 py-2 text-right" style={{ color: "var(--text-muted)" }}>%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.by_source.map((s) => (
                      <tr key={s.source} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                        <td className="px-4 py-2" style={{ color: "var(--text-primary)" }}>{s.source}</td>
                        <td className="px-4 py-2 text-right" style={{ color: "var(--text-secondary)" }}>
                          {s.count.toLocaleString()}
                        </td>
                        <td className="px-4 py-2 text-right" style={{ color: "var(--text-muted)" }}>
                          {((s.count / stats.total_jobs) * 100).toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Jobs by Category */}
            <div className="rounded-xl overflow-hidden" style={cardStyle}>
              <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <span className="font-medium" style={{ color: "var(--text-primary)" }}>Jobs by Category</span>
              </div>
              <div className="max-h-80 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      <th className="px-4 py-2 text-left" style={{ color: "var(--text-muted)" }}>Category</th>
                      <th className="px-4 py-2 text-right" style={{ color: "var(--text-muted)" }}>Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.by_category.map((c) => (
                      <tr key={c.search_category} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                        <td className="px-4 py-2" style={{ color: "var(--text-primary)" }}>
                          {c.search_category}
                        </td>
                        <td className="px-4 py-2 text-right" style={{ color: "var(--text-secondary)" }}>
                          {c.count.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Run Group Buttons */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
          Run Individual Groups
        </h2>
        <div className="flex flex-wrap gap-3">
          {SCRAPER_GROUPS.map((group) => (
            <button
              key={group}
              onClick={() => runGroup(group)}
              disabled={triggering === group}
              className="px-3 py-1.5 text-xs font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              style={{
                backgroundColor: "var(--bg-elevated)",
                color: "var(--text-secondary)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              {triggering === group ? "Running..." : group}
            </button>
          ))}
        </div>
      </div>

      {/* Recent Scraper Runs */}
      <div className="rounded-xl overflow-hidden" style={cardStyle}>
        <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <span className="font-medium" style={{ color: "var(--text-primary)" }}>Recent Scraper Runs</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <th className="px-4 py-2 text-left" style={{ color: "var(--text-muted)" }}>Source</th>
                <th className="px-4 py-2 text-left" style={{ color: "var(--text-muted)" }}>Status</th>
                <th className="px-4 py-2 text-left" style={{ color: "var(--text-muted)" }}>Found</th>
                <th className="px-4 py-2 text-left" style={{ color: "var(--text-muted)" }}>Inserted</th>
                <th className="px-4 py-2 text-left" style={{ color: "var(--text-muted)" }}>Updated</th>
                <th className="px-4 py-2 text-left" style={{ color: "var(--text-muted)" }}>Finished</th>
                <th className="px-4 py-2 text-left" style={{ color: "var(--text-muted)" }}>Error</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <td className="px-4 py-2 font-medium" style={{ color: "var(--text-primary)" }}>
                    {run.source}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className="px-2 py-0.5 rounded text-xs"
                      style={{
                        backgroundColor: run.status === "success" ? "var(--green-08)" : run.status === "failed" ? "var(--red-08)" : "var(--bg-elevated)",
                        color: run.status === "success" ? "var(--green)" : run.status === "failed" ? "var(--red)" : "var(--text-muted)",
                      }}
                    >
                      {run.status}
                    </span>
                  </td>
                  <td className="px-4 py-2" style={{ color: "var(--text-secondary)" }}>{run.jobs_found}</td>
                  <td className="px-4 py-2" style={{ color: "var(--green)" }}>
                    {run.jobs_inserted}
                  </td>
                  <td className="px-4 py-2" style={{ color: "var(--gold)" }}>
                    {run.jobs_updated}
                  </td>
                  <td className="px-4 py-2" style={{ color: "var(--text-muted)" }}>
                    {run.finished_at
                      ? new Date(run.finished_at + "Z").toLocaleString()
                      : "-"}
                  </td>
                  <td className="px-4 py-2 text-xs max-w-xs truncate" style={{ color: "var(--red)" }}>
                    {run.error_message || ""}
                  </td>
                </tr>
              ))}
              {runs.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center"
                    style={{ color: "var(--text-muted)" }}
                  >
                    No scraper runs yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardShell>
  );
}
